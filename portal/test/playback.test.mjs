import test from 'node:test';
import assert from 'node:assert/strict';
import { positionAt, DATA_HOLE_S } from '../src/lib/playback.js';

// Punto: [segundos, lat, lon, velocidad, rumbo, motor]
const pts = [[1000, 18.2, -71.1, 50, 0, 1], [1010, 18.201, -71.1, 50, 0, 1], [1020, 18.202, -71.1, 50, 0, 1], [1020 + DATA_HOLE_S + 60, 18.3, -71.1, 0, null, 0]];

test('el vehículo se coloca proporcionalmente entre dos puntos guardados (no salta de punto en punto)', () => {
  const [lat] = positionAt(pts, 0, 1005);
  assert.ok(Math.abs(lat - 18.2005) < 1e-9);
  assert.equal(positionAt(pts, 0, 1000)[0], 18.2);
  assert.ok(Math.abs(positionAt(pts, 1, 1015)[0] - 18.2015) < 1e-9);
});

test('el rumbo sale de hacia dónde va; un hueco de datos largo no se anima', () => {
  assert.ok(Math.abs(positionAt(pts, 0, 1005)[2] - 0) < 1) ; // hacia el norte
  const hole = positionAt(pts, 2, 1100, 77);
  assert.equal(hole[0], 18.202, 'dentro de un hueco largo se queda en el último punto conocido');
});
