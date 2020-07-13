import { loadDocumentWidgets, getWidgetById, setWidgetsLoading } from "./widget-init";
import { loadDocumentSVGs } from "./svg-manager";
import { request } from "./common";
import { DataProvider } from "./data";

loadDocumentWidgets();
loadDocumentSVGs();

const scrollbar = document.getElementById("caret-wrapper");
const scrollbarCaret = document.getElementById("scrollbar-caret");
const currentTime = document.getElementById("current-time");
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

let scrollingOrigin: number | undefined = undefined;
let scrollbarEnd: number = 0.0;

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

    if(scrollingOrigin === undefined) {
        const tr = DataProvider.getInstance().getTimeRange();
        const w = Math.min((tr.max - tr.min) / data.end, 1.0) * scrollbar.clientWidth;
        scrollbarCaret.style.width = "" + w + "px";
        
        const x = tr.min / data.end * (scrollbar.clientWidth - scrollbarCaret.clientWidth);
        scrollbarCaret.style.left = "" + x + "px";

        scrollbarEnd = data.end;
    }

    endTime.innerText = formatTime(data.end);
}

setInterval(updateScrollbar, 250);

function clearLoadingAndRender(wid: string) {
    const w = getWidgetById(wid);
    
    w.setLoading(false);
    w.render();
}

DataProvider.getInstance().onZoneDataChanged.register(() => clearLoadingAndRender("zone-graph"));

DataProvider.getInstance().onFrameDataChanged.register(() => {
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

        if(x < 0) {
            x = 0;
        } else if(x > xMax) {
            x = xMax;
        }

        scrollbarCaret.style.left = x.toString() + "px";
        currentTime.innerText = formatTime(x / xMax * scrollbarEnd);
    }
};

scrollbarCaret.onmouseup = (ev) => {
    if(ev.button === 0 && scrollingOrigin !== undefined)  {
        scrollingOrigin = undefined;
        DataProvider.getInstance().scrollTo(scrollbarCaret.offsetLeft / (scrollbar.clientWidth - scrollbarCaret.clientWidth) * scrollbarEnd);
    }
};

scrollbarCaret.onmouseleave = () => {
    if(scrollingOrigin !== undefined)  {
        scrollingOrigin = undefined;
        DataProvider.getInstance().scrollTo(scrollbarCaret.offsetLeft / (scrollbar.clientWidth - scrollbarCaret.clientWidth) * scrollbarEnd);
    }
};

setWidgetsLoading(true);
