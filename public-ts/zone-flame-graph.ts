import { Widget } from "./widget";
import { DataProvider } from "./data";
import { rgbToHsl } from "./color-conversion-algorithms";

export class ZoneFlameGraph extends Widget {
    public constructor(canvas: HTMLDivElement) {
        super(canvas);
        this.handleMouseWheel = true;
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
                            let nameX = x + Math.floor((rw - nameW) / 2);
                            if(nameX < 4) {
                                nameX = Math.min(4, x + rw - nameW - 4);
                            } else if(nameX + nameW > w - 4) {
                                nameX = Math.max(w - nameW - 4, x + 4);
                            }

                            const hslColor = rgbToHsl(r, g, b);
                            context.fillStyle = hslColor[2] < 0.5 ? "#FFFFFF" : "#000000";
                            context.fillText(name, nameX, y + Math.floor(lineHeight / 2));
                        }
                    }
                }
            }
        }
    }

    public onMouseWheel(x: number, y: number, dy: number) {
        const dp = DataProvider.getInstance();
        const tr = dp.getTimeRange();
        let amnt: number;

        if(dy > 0) {
            amnt = 1.1;
        } else {
            amnt = 0.9;
        }

        const t = x / this.canvas.clientWidth * (tr.max - tr.min) + tr.min;

        let start = (1.0 - amnt) * t + amnt * tr.min;
        let end = (1.0 - amnt) * t + amnt * tr.max;

        if(start < 0.0) {
            end -= start;
            start = 0.0;
        }

        if(end > dp.getDataEnd()) {
            const diff = end - dp.getDataEnd();

            start = Math.max(start - diff, 0.0);
            end = dp.getDataEnd();
        }
        
        //setWidgetsLoading(true); TODO: Only show loading after a certain time
        dp.setTimeRange(start, end);
    }
}
