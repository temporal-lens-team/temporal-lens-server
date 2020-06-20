import { FrameTimeGraph } from "./frame-times";
import { Widget } from "./widget";

type WidgetConstructor = new(canvas: HTMLCanvasElement) => Widget;
type WidgetRegistrar = {
    [className: string]: WidgetConstructor
}

const WIDGET_CLASSES: WidgetRegistrar = {
    "FrameTimeGraph": FrameTimeGraph
};

const WIDGETS: Map<string, Widget> = new Map();

for(const w of document.getElementsByClassName("widget")) {
    if(w.tagName === "CANVAS") {
        const canvas = w as HTMLCanvasElement;

        if(canvas.id.length <= 0) {
            console.error("Found widget with no ID");
        } else if(canvas.dataset["class"] === undefined) {
            console.error(`Widget ${canvas.id} has no class`);
        } else {
            const clsName = canvas.dataset["class"];
            const cls = WIDGET_CLASSES[clsName];

            if(cls === undefined) {
                console.error(`Widget ${canvas.id} has an invalid class name ${clsName}`);
            } else {
                WIDGETS.set(canvas.id, new cls(canvas));
            }
        }
    }
}

window.onresize = function() {
    for(const w of WIDGETS.values()) {
        w.updateSize();
    }
};

for(const w of WIDGETS.values()) {
    w.render();
}
