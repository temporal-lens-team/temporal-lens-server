import { loadDocumentWidgets, getWidgetById, setWidgetsLoading } from "./widget-init";
import { loadDocumentSVGs } from "./svg-manager";
import { DataProvider } from "./data";

loadDocumentWidgets();
loadDocumentSVGs();

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

scrollbarCaret.onmousedown = (ev) => {
    if(ev.button === 0 && scrollingOrigin === undefined && scrollbarEnd > 0.0) {
        const x = ev.clientX;
        const caretX = scrollbarCaret.offsetLeft;
        const caretW = scrollbarCaret.clientWidth;

        //if(x >= caretX && x <= caretX + caretW) {
            scrollingOrigin = caretX - x;
            setWidgetsLoading(true);
        //}
    }
};

scrollbarCaret.onmousemove = (ev) => {
    if(scrollingOrigin !== undefined) {
        let x = scrollingOrigin + ev.clientX;
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
};

scrollbarCaret.onmouseup = (ev) => {
    if(ev.button === 0 && scrollingOrigin !== undefined)  {
        scrollingOrigin = undefined;
        dp.scrollTo(scrollbarCaret.offsetLeft / (scrollbar.clientWidth - scrollbarCaret.clientWidth) * scrollbarEnd);
    }
};

scrollbarCaret.onmouseleave = () => {
    if(scrollingOrigin !== undefined)  {
        scrollingOrigin = undefined;
        dp.scrollTo(scrollbarCaret.offsetLeft / (scrollbar.clientWidth - scrollbarCaret.clientWidth) * scrollbarEnd);
    }
};

setWidgetsLoading(true);
