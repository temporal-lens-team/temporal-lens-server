import { Widget } from "./widget";
import { DataProvider } from "./data";
//import { setWidgetsLoading } from "./widget-init";

export class ZoneFlameGraph extends Widget {
    public constructor(canvas: HTMLDivElement) {
        super(canvas, true);
    }

    protected renderInternal(context: CanvasRenderingContext2D, w: number, h: number) {
        const lineHeight = 32;
        const dp = DataProvider.getInstance();
        const zd = dp.getZoneData();

        context.clearRect(0, 0, w, h);
        context.strokeStyle = "rgba(0, 0, 0, 0.5)";
        context.lineWidth = 1;
        context.textBaseline = "middle";
        context.font = "16px mono";

        for(const zone of zd) {
            const start = dp.remapTime(zone.start);
            const end = dp.remapTime(zone.end);

            if(start < 1.0 && end > 0.0) {
                const x = Math.floor(start * w);
                const rw = Math.floor((end - start) * w) - 2;

                if(rw >= 2) {
                    const r = (zone.color & 0xFF0000) >> 16;
                    const g = (zone.color & 0x00FF00) >> 8;
                    const b = zone.color & 0x0000FF;
                    const y = zone.depth * lineHeight;

                    context.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    context.fillRect(x, y, rw, lineHeight - 1);
                    context.strokeRect(x + 0.5, y + 0.5, rw, lineHeight - 1);

                    const name = zone.getZoneName();

                    if(name !== undefined) {
                        const nameW = context.measureText(name).width;

                        if(nameW + 4 <= rw) {
                            context.fillStyle = "#FFFFFF";
                            context.fillText(name, x + Math.floor((rw - nameW) / 2), y + Math.floor(lineHeight / 2));
                        }
                    }
                }
            }
        }
    }

    protected onMouseWheel(x: number, y: number, dy: number) {
        //TODO: Relative to x pos
        let amnt: number;

        if(dy < 0) {
            amnt = 1.1;
        } else {
            amnt = 0.9;
        }

        const dp = DataProvider.getInstance();
        const tr = dp.getTimeRange();
        const dt = (tr.max - tr.min) * 0.5 * amnt;
        const middle = (tr.min + tr.max) * 0.5;

        let start = middle - dt;
        let end = middle + dt;

        if(start < 0.0) {
            //TODO: ALSO CLAMP END!!!
            end -= start;
            start = 0.0;
        }
        
        //setWidgetsLoading(true); TODO: Only show loading after a certain time
        dp.setTimeRange(start, end);
    }
}