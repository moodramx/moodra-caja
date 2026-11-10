// admin-users: alta, baja y reset de contraseña de usuarios.
// Solo la puede usar un contador activo. Usa la service role key, que vive
// únicamente en los secrets de Supabase (nunca en el cliente ni en el repo).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'npm:zod@4'

const EMAIL_DOMAIN = 'caja.moodra.mx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{1,23}$/, 'Usuario inválido: 2 a 24 letras, números, punto o guion')
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72)

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    username,
    password,
    display_name: z.string().trim().min(1).max(40),
    role: z.enum(['integrante', 'contador']).default('integrante'),
    participa_reparto: z.boolean().default(true),
    emoji: z.string().trim().min(1).max(8).default('🎵'),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default('#ffffff'),
  }),
  z.object({ action: z.literal('set_active'), user_id: z.uuid(), activo: z.boolean() }),
  z.object({ action: z.literal('reset_password'), user_id: z.uuid(), password }),
  z.object({
    action: z.literal('update'),
    user_id: z.uuid(),
    display_name: z.string().trim().min(1).max(40).optional(),
    role: z.enum(['integrante', 'contador']).optional(),
    participa_reparto: z.boolean().optional(),
    emoji: z.string().trim().min(1).max(8).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  }),
])

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json(500, { error: 'Función mal configurada' })

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1. ¿Quién llama? Debe ser un contador activo.
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Falta sesión' })
  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller.user) return json(401, { error: 'Sesión inválida' })

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('id, role, activo')
    .eq('id', caller.user.id)
    .maybeSingle()
  if (!callerProfile || callerProfile.role !== 'contador' || !callerProfile.activo) {
    return json(403, { error: 'Solo el contador puede administrar usuarios' })
  }

  // 2. Validar la petición.
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json(400, { error: 'JSON inválido' })
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return json(400, { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' })
  }
  const body = parsed.data
  const device = req.headers.get('user-agent')

  const audit = (action: string, entityId: string, payload: Record<string, unknown>) =>
    admin.from('audit_log').insert({
      actor: callerProfile.id,
      action,
      entity: 'profiles',
      entity_id: entityId,
      payload,
      device,
    })

  // 3. Ejecutar.
  switch (body.action) {
    case 'create': {
      const { password: pw, action: _action, username: newUsername, ...details } = body
      // El trigger on_auth_user_created crea el perfil (como integrante, el
      // menor privilegio) en la misma transacción que el usuario.
      const { data, error } = await admin.auth.admin.createUser({
        email: `${newUsername}@${EMAIL_DOMAIN}`,
        password: pw,
        email_confirm: true,
      })
      if (error || !data.user) {
        const duplicate = /already|registered|duplicate|exists/i.test(error?.message ?? '')
        return json(duplicate ? 409 : 400, {
          error: duplicate ? 'Ese usuario ya existe' : (error?.message ?? 'No se pudo crear'),
        })
      }
      // Después se completan nombre, rol, emoji, etc.
      const { error: profileError } = await admin
        .from('profiles')
        .update({ ...details, created_by: callerProfile.id })
        .eq('id', data.user.id)
      if (profileError) {
        await audit('user.create_incompleto', data.user.id, { error: profileError.message })
        return json(500, {
          error:
            'El usuario se creó, pero no se guardaron sus datos. Avísale a quien mantiene la app.',
        })
      }
      await audit('user.create', data.user.id, { username: newUsername, ...details })
      return json(200, { user_id: data.user.id })
    }

    case 'set_active': {
      if (body.user_id === callerProfile.id && !body.activo) {
        return json(400, { error: 'No puedes desactivarte a ti mismo' })
      }
      const { error: banError } = await admin.auth.admin.updateUserById(body.user_id, {
        ban_duration: body.activo ? 'none' : '876000h',
      })
      if (banError) return json(400, { error: banError.message })
      const { error } = await admin
        .from('profiles')
        .update({ activo: body.activo })
        .eq('id', body.user_id)
      if (error) return json(400, { error: error.message })
      await audit(body.activo ? 'user.activate' : 'user.deactivate', body.user_id, {})
      return json(200, { ok: true })
    }

    case 'reset_password': {
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        password: body.password,
      })
      if (error) return json(400, { error: error.message })
      await audit('user.reset_password', body.user_id, {})
      return json(200, { ok: true })
    }

    case 'update': {
      const { action: _action, user_id, ...changes } = body
      if (Object.keys(changes).length === 0) return json(400, { error: 'Nada que cambiar' })
      if (user_id === callerProfile.id && changes.role === 'integrante') {
        return json(400, { error: 'No puedes quitarte el rol de contador' })
      }
      const { error } = await admin.from('profiles').update(changes).eq('id', user_id)
      if (error) return json(400, { error: error.message })
      await audit('user.update', user_id, changes)
      return json(200, { ok: true })
    }
  }
})
