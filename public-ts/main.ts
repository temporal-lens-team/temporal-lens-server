import { loadDocumentWidgets, getWidgetById, setWidgetsLoading } from "./widget-init";
import { loadDocumentSVGs } from "./svg-manager";
import { DataProvider } from "./data";
import { EventHandler, initEventManager, registerEventHandler, getCurrentMouseEvent } from "./event-manager";

loadDocumentWidgets();
loadDocumentSVGs();
initEventManager();

const scrollbar      = document.getElementById("caret-wrapper");
const scrollbarCaret = document.getElementById("scrollbar-caret");
const currentTime    = document.getElementById("current-time");
const endTime        = document.getElementById("end-time");

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

function clearLoadingAndRender(wid: string) {
    const w = getWidgetById(wid);
    
    w.setLoading(false);
    w.render();
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
dp.onZoneDataChanged.register(() => clearLoadingAndRender("zone-graph"));
dp.onFrameDataChanged.register(() => {
    clearLoadingAndRender("frame-times");
    clearLoadingAndRender("frame-delimiters");
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

registerEventHandler(new ScrollbarCaret());
setWidgetsLoading(true);
