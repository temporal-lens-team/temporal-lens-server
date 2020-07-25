import { Widget } from "./widget";
import { FrameTimeGraph } from "./frame-times";
import { FrameDelimiterGraph } from "./frame-delimiter";
import { ZoneFlameGraph } from "./zone-flame-graph";

type WidgetConstructor = new(canvas: HTMLDivElement) => Widget;
type WidgetRegistrar = {
    [className: string]: WidgetConstructor
}

const WIDGET_CLASSES: WidgetRegistrar = {
    "FrameTimeGraph": FrameTimeGraph,
    "FrameDelimiterGraph": FrameDelimiterGraph,
    "ZoneFlameGraph": ZoneFlameGraph
};

const WIDGETS: Map<string, Widget> = new Map();
const ZONE_GRAPHS: ZoneFlameGraph[] = [];

export function loadDocumentWidgets() {
    for(const w of document.getElementsByClassName("widget")) {
        if(w.tagName === "DIV") {
            const div = w as HTMLDivElement;
    
            if(div.id.length <= 0) {
                console.error("Found widget with no ID");
            } else if(div.dataset["class"] === undefined) {
                console.error(`Widget ${div.id} has no class`);
            } else {
                const clsName = div.dataset["class"];
                const cls = WIDGET_CLASSES[clsName];
    
                if(cls === undefined) {
                    console.error(`Widget ${div.id} has an invalid class name ${clsName}`);
                } else {
                    const widget = new cls(div);
                    WIDGETS.set(div.id, widget);

                    if(clsName === "ZoneFlameGraph") {
                        ZONE_GRAPHS.push(widget as ZoneFlameGraph);
                    }
                }
            }
        }
    }

    window.onresize = () => {
        for(const w of WIDGETS.values()) {
            w.updateSize();
            w.render();
        }
    };
    
    for(const w of WIDGETS.values()) {
        w.render();
    }
}

export function getWidgetById(wid: string): Widget {
    return WIDGETS.get(wid);
}

export function setWidgetsLoading(loading: boolean) {
    WIDGETS.get("frame-times").setLoading(loading);

    for(const w of ZONE_GRAPHS) {
        w.setLoading(loading);
    }
}

export function createWidget(id: string, className: string, appendTo: HTMLElement): Widget | undefined {
    const cls = WIDGET_CLASSES[className];
    if(cls === undefined) {
        console.error(`Cannot instantiate widget "${id}" of class "${className}": Not such widget class.`);
        return undefined;
    }

    const div = document.createElement("div");
    div.id = id;
    div.classList.add("widget");
    div.dataset["class"] = className;
    appendTo.appendChild(div);

    const ret = new cls(div);
    WIDGETS.set(id, ret);

    if(className === "ZoneFlameGraph") {
        ZONE_GRAPHS.push(ret as ZoneFlameGraph);
    }

    return ret;
}

export function getZoneGraphs() {
    //This is bad design. I know.
    return ZONE_GRAPHS;
}
