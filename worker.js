// 沿用網頁給的版本參數，避免瀏覽器拿到快取的舊版 solver.js
importScripts('solver.js' + self.location.search);

self.onmessage = function (event) {
  const { heroes, ennen, options } = event.data;
  self.postMessage(JinpoSolver.solve(heroes, ennen, options));
};
