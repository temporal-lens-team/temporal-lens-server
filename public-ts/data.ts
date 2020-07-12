import { request, SimpleEvent } from "./common";

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
    private timeRange: TimeRange = { min: 0.0, max: 0.25 + 3.0 / 60.0 };
    private strings: Map<number, string> = new Map();
    private threadNames: Map<number, string> = new Map();

    private frameData: FrameInfo[] = [];
    private zoneData: ZoneInfo[] = []; //TODO: One per thread

    public onFrameDataChanged: SimpleEvent = new SimpleEvent();
    public onZoneDataChanged: SimpleEvent = new SimpleEvent();

    private constructor() {
        setTimeout(() => this.awaitInitialZoneData(), 50);
        setTimeout(() => this.awaitInitialFrameTimes(), 100);
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

    public getTimeRange(): TimeRange {
        return this.timeRange;
    }

    public remapTime(t: number): number {
        return (t - this.timeRange.min) / (this.timeRange.max - this.timeRange.min);
    }

    public getFrameInfo(frame: number): FrameInfo | undefined {
        return this.frameData[frame];
    }

    public lastFrameNumber(): number {
        if(this.frameData.length <= 0) {
            return 0;
        }

        return this.frameData[this.frameData.length - 1].number;
    }

    private async fetchZoneData(start: number, end: number): Promise<boolean> {
        let data;

        try {
            data = JSON.parse(await request("/data/plots?start=" + start + "&end=" + end));
        } catch(err) {
            console.error(err);
            return false;
        }

        if(data.status !== "ok") {
            console.error(data.error);
            return false;
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

        this.onZoneDataChanged.invoke();
        return true;
    }

    private async awaitInitialZoneData() {
        if(await this.fetchZoneData(this.timeRange.min, this.timeRange.max * 1.05)) {
            if(this.zoneData.length > 0 && this.zoneData[this.zoneData.length - 1].end >= this.timeRange.max) {
                return;
            }
        }

        setTimeout(() => this.awaitInitialZoneData(), 250);
    }

    private async fetchFrameTimes(t: number, count: number): Promise<boolean> {
        let data;

        try {
            data = JSON.parse(await request("/data/frame-times/query-count?t=" + t + "&count=" + count));
        } catch(err) {
            console.error(err);
            return false;
        }

        if(data.status !== "ok") {
            console.error(data.error);
            return false;
        }

        let safeData = data as FrameDataQueryResult;
        this.frameData.length = 0;

        for(const fd of safeData.results) {
            this.frameData.push(new FrameInfo(fd));
        }

        this.onFrameDataChanged.invoke();
        return true;
    }

    private async awaitInitialFrameTimes() {
        if(await this.fetchFrameTimes(this.timeRange.min, 60)) {
            if(this.frameData.length >= 60) {
                return;
            }
        }

        setTimeout(() => this.awaitInitialFrameTimes(), 250);
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
