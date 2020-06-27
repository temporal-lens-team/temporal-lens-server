type JSONFrameInfo = {
    number: number,
    duration: number,
    end: number
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

export type TimeRange = {
    min: number,
    max: number
};

type FrameDataQueryResult = {
    results: JSONFrameInfo[],
    status: string
}

function request(url: string, method: string = "GET"): Promise<string> {
    return new Promise((resolve, reject) => {
        let req = new XMLHttpRequest();

        req.open(method, url);
        req.onload = () => resolve(req.responseText);
        req.onerror = () => reject(new Error("XMLHttpRequest error: " + req.statusText));
        req.send();
    });
}

export class DataProvider {
    private static instance: DataProvider | undefined = undefined;
    private frameData: FrameInfo[] = [];
    private timeRange: TimeRange = { min: 0.25, max: 0.25 + 3.0 / 60.0 };
    private onTimeRangeChange: VoidFunction[] = [];
    private autoscrollCallbacks: VoidFunction[] = [];
    private autoScrollInterval: number | undefined;

    private constructor() {
        this.autoScrollInterval = setInterval(() => this.autoscrollPoller(), 100);
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

        for(let callback of this.onTimeRangeChange) {
            callback();
        }
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
        await this.fetchFrameData(-5.0); //TODO: Determine best duration automatically

        for(let callback of this.autoscrollCallbacks) {
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
        this.frameData.length = 0;

        for(let fi of safeData.results) {
            this.frameData.push(new FrameInfo(fi));
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
}
