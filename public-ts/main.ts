import { Widget } from "./widget";
import { FrameTimeGraph } from "./frame-times";
import { FrameDelimiterGraph } from "./frame-delimiter";
import { ZoneFlameGraph } from "./zone-flame-graph";
import { loadDocumentSVGs } from "./svg-manager";
import { request } from "./common";
import { DataProvider } from "./data";

type WidgetConstructor = new(canvas: HTMLCanvasElement) => Widget;
type WidgetRegistrar = {
    [className: string]: WidgetConstructor
}

const WIDGET_CLASSES: WidgetRegistrar = {
    "FrameTimeGraph": FrameTimeGraph,
    "FrameDelimiterGraph": FrameDelimiterGraph,
    "ZoneFlameGraph": ZoneFlameGraph
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

window.onresize = () => {
    for(const w of WIDGETS.values()) {
        w.updateSize();
        w.render();
    }
};

for(const w of WIDGETS.values()) {
    w.render();
}

loadDocumentSVGs();

const scrollbar = document.getElementById("caret-wrapper");
const scrollbarCaret = document.getElementById("scrollbar-caret");
const endTime = document.getElementById("end-time");

type ZonesEndResult = {
    status: string,
    end: number,
    error: string
};

function prefixZeroes(x: number): string {
    if(x < 10) {
        return "0" + x;
    } else {
        return x.toString();
    }
}

function formatTime(t: number): string {
    const totalMinutes = Math.floor(t / 60);
    const seconds = t - totalMinutes * 60;
    const hours = Math.floor(totalMinutes / 60);

    let secondsStr = seconds.toFixed(3);
    if(seconds < 10) {
        secondsStr = "0" + secondsStr;
    }

    return prefixZeroes(hours) + ":" + prefixZeroes(totalMinutes - hours * 60) + ":" + secondsStr;
}

async function updateScrollbar() {
    let data: ZonesEndResult;

    try {
        data = JSON.parse(await request("/data/zones-end"));
    } catch(err) {
        console.error(err);
        return;
    }

    if(data.status !== "ok") {
        console.error(data.error);
        return;
    }

    const tr = DataProvider.getInstance().getTimeRange();
    const w = Math.min((tr.max - tr.min) / data.end, 1.0) * scrollbar.clientWidth;
    scrollbarCaret.style.width = "" + w + "px";
    
    const x = tr.min / data.end * (scrollbar.clientWidth - scrollbarCaret.clientWidth);
    scrollbarCaret.style.left = "" + x + "px";

    endTime.innerText = formatTime(data.end);
}

setInterval(updateScrollbar, 250);

DataProvider.getInstance().onZoneDataChanged.register(() => WIDGETS.get("zone-graph").render());
DataProvider.getInstance().onFrameDataChanged.register(() => {
    WIDGETS.get("frame-times").render();
    WIDGETS.get("frame-delimiters").render();
});
