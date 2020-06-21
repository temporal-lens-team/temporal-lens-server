export type FrameInfo = {
    id: number,
    start: number,
    end: number
};

export type TimeRange = {
    min: number,
    max: number
};

export class DataProvider {
    private static instance: DataProvider | undefined = undefined;
    private frameData: FrameInfo[] = [];
    private timeRange: TimeRange = { min: 0.25, max: 0.25 + 3.0 / 60.0 };
    private onTimeRangeChange: VoidFunction | undefined = undefined;

    private constructor() {
        //TODO: Remove this. For debugging purposes only.
        let prev = 0.0;

        for(let i = 0; i < 60; i++) {
            const next = prev + Math.random() / 60.0;
            this.frameData.push({ id: i, start: prev, end: next });
            prev = next;
        }
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

    public setOnTimeRangeChangeCallback(callback: VoidFunction | undefined) {
        this.onTimeRangeChange = callback;
    }

    public setTimeRange(min: number, max: number) {
        this.timeRange.min = min;
        this.timeRange.max = max;

        if(this.onTimeRangeChange) {
            this.onTimeRangeChange();
        }
    }

    public getTimeRange(): TimeRange {
        return this.timeRange;
    }

    public remapTime(t: number): number {
        return (t - this.timeRange.min) / (this.timeRange.max - this.timeRange.min);
    }
}
