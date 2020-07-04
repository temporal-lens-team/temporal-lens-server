import { request } from "./common";

type JSONFrameInfo = {
    number: number,
    duration: number,
    end: number
};

type JSONZoneInfo = {
    entry_id: number,
    zone_uid: number,
    color   : number,
    end     : number,
    duration: number,
    depth   : number,
    name    : number,
    thread  : number
};

export class FrameInfo {
    public number: number;
    public start: number;
    public duration: number;
    public end: number;

    public constructor(orig: JSONFrameInfo) {
        this.number = orig.number;
        this.start = orig.end - orig.duration * 1e-9;
        this.duration = orig.duration;
        this.end = orig.end;
    }
};

export class ZoneInfo {
    public entry_id: number;
    public zone_uid: number;
    public color   : number;
    public start   : number;
    public end     : number;
    public duration: number;
    public depth   : number;

    private name: number;
    private thread: number;

    public constructor(orig: JSONZoneInfo) {
        this.entry_id = orig.entry_id;
        this.zone_uid = orig.zone_uid;
        this.color    = orig.color;
        this.start    = orig.end - orig.duration * 1e-9;
        this.end      = orig.end;
        this.duration = orig.duration;
        this.depth    = orig.depth;
        this.name     = orig.name;
        this.thread   = orig.thread;
    }

    public getZoneName(): string | undefined {
        return DataProvider.getInstance().getString(this.name);
    }

    public getThreadName(): string | undefined {
        return DataProvider.getInstance().getThreadName(this.thread);
    }
}

export type TimeRange = {
    min: number,
    max: number
};

type FrameDataQueryResult = {
    results: JSONFrameInfo[],
    status: string
}

type StringMap = {
    [key: string]: string
};

type ZoneDataQueryResult = {
    status: string,
    strings: StringMap,
    thread_names: StringMap,
    results: JSONZoneInfo[]
};

export class DataProvider {
    private static instance: DataProvider | undefined = undefined;
    private frameData: FrameInfo[] = [];
    private timeRange: TimeRange = { min: 0.25, max: 0.25 + 3.0 / 60.0 };
    private onTimeRangeChange: VoidFunction[] = [];
    private autoscrollCallbacks: VoidFunction[] = [];
    private autoScrollInterval: number | undefined = undefined;
    private strings: Map<number, string> = new Map();
    private threadNames: Map<number, string> = new Map();
    private zoneData: ZoneInfo[] = []; //TODO: One per thread
    private avgFrameDuration: number = 1.0 / 60.0;
    private lastFrameCount: number = 60; //This should certainly not be hard-coded like this. This should be set by the FrameTime widget!

    private constructor() {
        this.setAutoScrollEnabled(true);
    }

    public static getInstance(): DataProvider {
        if(this.instance === undefined) {
            this.instance = new DataProvider();
        }

        return this.instance;
    }

    public getFrameData(): FrameInfo[] {
        return this.frameData;
    }

    public registerOnTimeRangeChangeCallback(callback: VoidFunction) {
        this.onTimeRangeChange.push(callback);
    }

    public registerAutoscrollCallback(callback: VoidFunction) {
        this.autoscrollCallbacks.push(callback);
    }

    public setTimeRange(min: number, max: number) {
        this.timeRange.min = min;
        this.timeRange.max = max;

        this.fetchZoneData(min, max);
    }

    public setFrameRange(min: number, max: number): boolean {
        if(this.frameData.length <= 0) {
            //TODO: ACQUIRE DATA ASYCHRONOUSLY
            return false;
        }

        let rMin = min - this.frameData[0].number;
        let rMax = max - this.frameData[0].number;

        if(rMin < 0 || rMax >= this.frameData.length) {
            //TODO: ACQUIRE DATA ASYCHRONOUSLY
            return false;
        } else {
            this.setTimeRange(this.frameData[rMin].start, this.frameData[rMax].end);
            return true;
        }
    }

    public getTimeRange(): TimeRange {
        return this.timeRange;
    }

    public remapTime(t: number): number {
        return (t - this.timeRange.min) / (this.timeRange.max - this.timeRange.min);
    }

    public getFrameInfo(frame: number): FrameInfo | undefined {
        if(this.frameData.length <= 0) {
            return undefined;
        }

        let i = frame - this.frameData[0].number;

        if(i < 0 || i >= this.frameData.length) {
            return undefined;
        }

        return this.frameData[i];
    }

    private async autoscrollPoller() {
        await this.fetchFrameData(this.avgFrameDuration * this.lastFrameCount * -1.5);

        for(const callback of this.autoscrollCallbacks) {
            callback();
        }
    }

    private async fetchFrameData(start: number, end?: number) {
        let data;
        let url = "/data/frame-times?start=" + start;

        if(end !== undefined) {
            url += "&end=" + end;
        }

        try {
            data = JSON.parse(await request(url));
        } catch(err) {
            console.error(err);
            return;
        }

        if(data.status !== "ok") {
            console.error(data.error);
            return;
        }

        let safeData = data as FrameDataQueryResult;
        let afd = 0.0;
        this.frameData.length = 0;

        for(let fi of safeData.results) {
            afd += fi.duration * 1e-9;
            this.frameData.push(new FrameInfo(fi));
        }

        if(safeData.results.length >= 10) {
            this.avgFrameDuration = afd / safeData.results.length;
        }
    }

    public isAutoScrollEnabled(): boolean {
        return this.autoScrollInterval !== undefined;
    }

    public lastFrameNumber(): number {
        if(this.frameData.length <= 0) {
            return 0;
        }

        return this.frameData[this.frameData.length - 1].number;
    }

    public setAutoScrollEnabled(enabled: boolean) {
        if(enabled && this.autoScrollInterval === undefined) {
            this.autoScrollInterval = setInterval(() => this.autoscrollPoller(), 100);
        } else if(!enabled && this.autoScrollInterval !== undefined) {
            clearInterval(this.autoScrollInterval);
            this.autoScrollInterval = undefined;
        }
    }

    private async fetchZoneData(start: number, end: number) {
        let data;

        try {
            data = JSON.parse(await request("/data/plots?start=" + start + "&end=" + end));
        } catch(err) {
            console.error(err);
            return;
        }

        if(data.status !== "ok") {
            console.error(data.error);
            return;
        }

        let safeData = data as ZoneDataQueryResult;

        for(const key in safeData.strings) {
            this.strings.set(parseInt(key), safeData.strings[key]);
        }

        for(const key in safeData.thread_names) {
            this.threadNames.set(parseInt(key), safeData.thread_names[key]);
        }

        this.zoneData.length = 0;

        for(const zd of safeData.results) {
            this.zoneData.push(new ZoneInfo(zd));
        }

        for(const callback of this.onTimeRangeChange) {
            callback();
        }
    }

    public getString(id: number): string | undefined {
        return this.strings.get(id);
    }

    public getThreadName(id: number): string | undefined {
        return this.threadNames.get(id);
    }

    public getZoneData(): ZoneInfo[] {
        return this.zoneData;
    }
}
