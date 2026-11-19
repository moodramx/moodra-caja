import { describe, expect, it } from 'vitest'
import {
  addFix,
  decodePolyline,
  emptyTrack,
  encodePolyline,
  encodeRoute,
  formatDuration,
  haversineM,
  sampleRoute,
  simplify,
  trafficPctFromSpeed,
  type LatLng,
} from './track'

// Zócalo y Ángel de la Independencia: unos 4.2 km en línea recta.
const ZOCALO: LatLng = [19.4326, -99.1332]
const ANGEL: LatLng = [19.427, -99.1677]

const fix = (lat: number, lng: number, seconds: number, accuracy = 10) => ({
  lat,
  lng,
  accuracy,
  time: seconds * 1000,
})
/** 0.001° de latitud ≈ 111 m. */
const north = (steps: number): number => 19.4 + steps * 0.001

describe('haversineM', () => {
  it('mide la distancia entre dos puntos de la ciudad', () => {
    const d = haversineM(ZOCALO, ANGEL)
    expect(d).toBeGreaterThan(3600)
    expect(d).toBeLessThan(3750)
  })
  it('es cero entre un punto y sí mismo', () => {
    expect(haversineM(ZOCALO, ZOCALO)).toBe(0)
  })
})

describe('addFix', () => {
  it('suma lo que avanza el auto', () => {
    let track = emptyTrack()
    for (let i = 0; i <= 10; i++) track = addFix(track, fix(north(i), -99.1, i * 10))
    expect(track.points).toHaveLength(11)
    expect(Math.round(track.distanceM)).toBeGreaterThan(1100)
    expect(Math.round(track.distanceM)).toBeLessThan(1120)
    expect(track.gaps).toBe(0)
  })

  it('ignora lecturas imprecisas', () => {
    let track = addFix(emptyTrack(), fix(north(0), -99.1, 0))
    track = addFix(track, fix(north(5), -99.1, 30, 200))
    expect(track.points).toHaveLength(1)
    expect(track.distanceM).toBe(0)
  })

  it('no cuenta el baile del GPS cuando el auto está parado', () => {
    let track = addFix(emptyTrack(), fix(19.4, -99.1, 0))
    for (let i = 1; i < 30; i++) {
      track = addFix(track, fix(19.4 + (i % 2) * 0.00008, -99.1, i * 2))
    }
    expect(track.distanceM).toBe(0)
  })

  it('descarta un brinco imposible', () => {
    let track = addFix(emptyTrack(), fix(north(0), -99.1, 0))
    // 11 km en 5 segundos
    track = addFix(track, fix(north(100), -99.1, 5))
    expect(track.points).toHaveLength(1)
  })

  it('cuenta un hueco cuando el celular se calla y aparece lejos', () => {
    let track = addFix(emptyTrack(), fix(north(0), -99.1, 0))
    track = addFix(track, fix(north(1), -99.1, 10))
    // 5 minutos sin señal y 2.2 km más adelante
    track = addFix(track, fix(north(21), -99.1, 310))
    expect(track.gaps).toBe(1)
    expect(Math.round(track.distanceM / 100)).toBe(23)
  })

  it('no cuenta como hueco estar parado mucho rato', () => {
    let track = addFix(emptyTrack(), fix(north(0), -99.1, 0))
    track = addFix(track, fix(north(1), -99.1, 600))
    expect(track.gaps).toBe(0)
  })
})

describe('trafficPctFromSpeed', () => {
  it('no agrega nada si el viaje fue fluido', () => {
    expect(trafficPctFromSpeed(50_000, 3600)).toBe(0)
  })
  it('agrega según lo lento que fue', () => {
    // 30 km/h
    expect(trafficPctFromSpeed(30_000, 3600)).toBe(15)
  })
  it('tiene tope de 30 %', () => {
    expect(trafficPctFromSpeed(5_000, 3600)).toBe(30)
  })
  it('sin datos no inventa', () => {
    expect(trafficPctFromSpeed(0, 0)).toBe(0)
  })
})

describe('polilínea', () => {
  it('codifica como Google Maps', () => {
    // Ejemplo de la documentación de Google.
    expect(
      encodePolyline([
        [38.5, -120.2],
        [40.7, -120.95],
        [43.252, -126.453],
      ]),
    ).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
  })
  it('va y viene sin perder la ruta', () => {
    const route: LatLng[] = [ZOCALO, [19.43, -99.15], ANGEL]
    expect(decodePolyline(encodePolyline(route))).toEqual(route)
  })
  it('una ruta vacía es un texto vacío', () => {
    expect(encodePolyline([])).toBe('')
    expect(decodePolyline('')).toEqual([])
  })
})

describe('simplify y encodeRoute', () => {
  const straight: LatLng[] = Array.from({ length: 200 }, (_, i) => [north(i), -99.1])
  it('una recta se queda en sus dos extremos', () => {
    expect(simplify(straight, 15)).toEqual([straight[0], straight.at(-1)])
  })
  it('conserva las vueltas', () => {
    const turn: LatLng[] = [...straight, [north(199), -99.05]]
    expect(simplify(turn, 15)).toHaveLength(3)
  })
  it('recorta hasta caber en el límite', () => {
    const zigzag: LatLng[] = Array.from({ length: 3000 }, (_, i) => [
      north(i),
      -99.1 + (i % 2) * 0.002,
    ])
    expect(encodeRoute(zigzag, 2000).length).toBeLessThanOrEqual(2000)
  })
})

describe('sampleRoute', () => {
  const route: LatLng[] = Array.from({ length: 101 }, (_, i) => [north(i), -99.1])
  it('reparte los puntos a lo largo de la ruta, con los dos extremos', () => {
    const sample = sampleRoute(route, 5)
    expect(sample).toHaveLength(5)
    expect(sample[0]).toEqual(route[0])
    expect(sample[4]).toEqual(route[100])
    // El de en medio cae a la mitad (con margen de un punto por redondeo).
    expect(Math.abs(sample[2]![0] - route[50]![0])).toBeLessThan(0.0015)
  })
  it('si hay pocos puntos los deja todos', () => {
    expect(sampleRoute(route.slice(0, 3), 10)).toHaveLength(3)
  })
})

describe('formatDuration', () => {
  it('escribe minutos y horas', () => {
    expect(formatDuration(540)).toBe('9 min')
    expect(formatDuration(3725)).toBe('1 h 02 min')
  })
})
