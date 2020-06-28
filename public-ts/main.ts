import { DataProvider } from "./data";
import { Widget } from "./widget";
import { FrameTimeGraph } from "./frame-times";
import { FrameDelimiterGraph } from "./frame-delimiter";
import { ZoneFlameGraph } from "./zone-flame-graph";
import { setSVG, loadDocumentSVGs } from "./svg-manager";

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

DataProvider.getInstance().registerOnTimeRangeChangeCallback(() => {
    for(const w of WIDGETS.values()) {
        w.render();
    }
});

for(const w of WIDGETS.values()) {
    w.render();
}

loadDocumentSVGs();

const frameTimesWidget = WIDGETS.get("frame-times") as FrameTimeGraph;
const playPauseButton = document.getElementById("play-pause") as HTMLButtonElement;

playPauseButton.onclick = () => {
    const dp = DataProvider.getInstance();
    const en = !dp.isAutoScrollEnabled();

    dp.setAutoScrollEnabled(en);
    setSVG(playPauseButton, en ? "svg/pause.svg" : "svg/play.svg");
};

frameTimesWidget.registerUserScrollCallback(() => {
    const dp = DataProvider.getInstance();

    if(dp.isAutoScrollEnabled()) {
        dp.setAutoScrollEnabled(false);
        setSVG(playPauseButton, "svg/play.svg");
    }
});
