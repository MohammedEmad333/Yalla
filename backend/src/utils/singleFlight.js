'use strict';

/** Skip overlapping async invocations; reset the guard on success or rejection. */
function singleFlight(task) {
  let running = false;
  return async (...args) => {
    if (running) return false;
    running = true;
    try {
      await task(...args);
      return true;
    } finally {
      running = false;
    }
  };
}

module.exports = { singleFlight };
