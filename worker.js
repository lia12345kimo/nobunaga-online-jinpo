importScripts('solver.js');

self.onmessage = function (event) {
  const { heroes, ennen, options } = event.data;
  self.postMessage(JinpoSolver.solve(heroes, ennen, options));
};
