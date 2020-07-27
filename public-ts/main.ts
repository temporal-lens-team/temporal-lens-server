import { loadDocumentWidgets, getWidgetById, setWidgetsLoading, createWidget, getAllWidgets } from "./widget-init";
import { loadDocumentSVGs } from "./svg-manager";
import { DataProvider, HeapInfo } from "./data";
import { EventHandler, initEventManager, registerEventHandler, getCurrentMouseEvent } from "./event-manager";
import { ZoneFlameGraph } from "./zone-flame-graph";
import { Plot } from "./plot";
import { formatTime, formatUnits, STORAGE_UNITS } from "./common";

loadDocumentWidgets();
loadDocumentSVGs();
initEventManager();

const scrollbar      = document.getElementById("caret-wrapper");
const scrollbarCaret = document.getElementById("scrollbar-caret");
const currentTime    = document.getElementById("current-time");
const endTime        = document.getElementById("end-time");

function clearLoadingAndRender(wid: string) {
    if(wid === "zone-graphs") {
        for(const w of getAllWidgets()) {
            if(w instanceof ZoneFlameGraph) {
                w.setLoading(false);
                w.render();
            }
        }
    } else {
        const w = getWidgetById(wid);
        
        w.setLoading(false);
        w.render();
    }
}

let scrollingOrigin: number | undefined = undefined;
let scrollbarEnd: number = 0.0;
const dp = DataProvider.getInstance();

function updateScrollbarCaret() {
    if(scrollingOrigin === undefined) {
        const dataEnd = dp.getDataEnd();
        const tr = dp.getTimeRange();
        
        //Update width
        const w = Math.min((tr.max - tr.min) / dataEnd, 1.0) * scrollbar.clientWidth;
        scrollbarCaret.style.width = w.toString() + "px";
        
        //Update position
        const x = tr.min / dataEnd * (scrollbar.clientWidth - scrollbarCaret.clientWidth);
        scrollbarCaret.style.left = x.toString() + "px";

        //Update time labels
        currentTime.innerText = formatTime(tr.min);
        endTime.innerText = formatTime(tr.max);

        //Keep time for scroll operations
        scrollbarEnd = dataEnd;
    }
}

dp.onEndChanged.register(updateScrollbarCaret);
dp.onTimeRangeChanged.register(updateScrollbarCaret);

dp.onMainDataChanged.register(() => {
    clearLoadingAndRender("zone-graphs");
    clearLoadingAndRender("heap-plot");
});

dp.onFrameDataChanged.register(() => {
    clearLoadingAndRender("frame-times");
    clearLoadingAndRender("frame-delimiters");
});

dp.onNewThread.register((tid) => {
    const div = document.createElement("div");
    const h3 = document.createElement("h3");

    div.classList.add("per-thread");
    h3.innerText = `Thread "${dp.getThreadName(tid)}"`;
    div.appendChild(h3);
    document.getElementById("zone-graphs").appendChild(div);

    const widget = createWidget("zones-graph-" + tid, "ZoneFlameGraph", div) as ZoneFlameGraph;
    widget.setThreadID(tid);
});

class ScrollbarCaret extends EventHandler {
    public constructor() {
        super(scrollbarCaret);
    }

    public onMouseDown(button: number, _x: number, _y: number) {
        if(button === 0 && scrollingOrigin === undefined && scrollbarEnd > 0.0) {
            const caretX = scrollbarCaret.offsetLeft;

            scrollingOrigin = caretX - getCurrentMouseEvent().clientX;
            setWidgetsLoading(true);
        }
    }

    public onMouseMove(_x: number, _y: number) {
        if(scrollingOrigin !== undefined) {
            let x = scrollingOrigin + getCurrentMouseEvent().clientX;
            const xMax = scrollbar.clientWidth - scrollbarCaret.clientWidth;
            const dt = dp.getTimeRange().max - dp.getTimeRange().min;
    
            if(x < 0) {
                x = 0;
            } else if(x > xMax) {
                x = xMax;
            }
    
            const startTime = x / xMax * scrollbarEnd;
    
            scrollbarCaret.style.left = x.toString() + "px";
            currentTime.innerText = formatTime(startTime);
            endTime.innerText = formatTime(startTime + dt);
        }
    }
    
    public onMouseUp(button: number, _x: number, _y: number) {
        if(button === 0 && scrollingOrigin !== undefined)  {
            scrollingOrigin = undefined;
            dp.scrollTo(scrollbarCaret.offsetLeft / (scrollbar.clientWidth - scrollbarCaret.clientWidth) * scrollbarEnd);
        }
    }
}

document.getElementById("scrollbar-left").onclick = () => {
    const tr = dp.getTimeRange();
    const dt = tr.max - tr.min;

    const min = Math.max(tr.min - dt * 0.25, 0.0);
    const max = min + dt;

    dp.setTimeRange(min, max);
};

document.getElementById("scrollbar-right").onclick = () => {
    const tr = dp.getTimeRange();
    const dt = tr.max - tr.min;

    const max = Math.min(tr.max + dt * 0.25, dp.getDataEnd());
    const min = max - dt;

    dp.setTimeRange(min, max);
};

const heapPlot = getWidgetById("heap-plot") as Plot<HeapInfo>;
heapPlot.setDataAndAccessor(dp.getHeapData(), (hi) => { return { t: hi.t, y: hi.used } });
heapPlot.setLabeler((d) => `<strong>Heap: </strong>${formatUnits(d.used, STORAGE_UNITS)}`);

registerEventHandler(new ScrollbarCaret());
setWidgetsLoading(true);
