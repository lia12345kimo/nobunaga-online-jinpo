importScripts('solver.js');

self.onmessage = function (event) {
  const { heroes, ennen, options, exact } = event.data;
  const run = exact ? JinpoSolver.solve : JinpoSolver.search;
  self.postMessage(run(heroes, ennen, options));
};
