'use strict';

function validGeoPoint(value) {
  return Array.isArray(value) && value.length === 2 && value.every((coordinate, index) => {
    if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) return false;
    return index === 0 ? coordinate >= -180 && coordinate <= 180 : coordinate >= -90 && coordinate <= 90;
  });
}

module.exports = { validGeoPoint };
