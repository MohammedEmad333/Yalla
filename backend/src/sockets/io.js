'use strict';

// حاوية بسيطة لمرجع Socket.io حتى نتمكّن من البثّ (emit) من أي طبقة
// (خدمات، متحكّمات) دون تمرير io يدويًا في كل مكان.
let ioInstance = null;

module.exports = {
  set: (io) => {
    ioInstance = io;
  },
  get: () => {
    if (!ioInstance) throw new Error('Socket.io لم تُهيّأ بعد');
    return ioInstance;
  },
};
