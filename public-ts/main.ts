import { FrameTimeGraph } from "./frame-times";

const frameTimeGraph = new FrameTimeGraph(document.getElementById("frame-times") as HTMLCanvasElement);

window.onresize = function() {
    frameTimeGraph.updateSize();
    frameTimeGraph.render();
};

frameTimeGraph.render();
