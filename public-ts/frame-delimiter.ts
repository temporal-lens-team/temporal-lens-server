import { Widget } from "./widget";
import { DataProvider } from "./data";

export class FrameDelimiterGraph extends Widget {
    public constructor(canvas: HTMLCanvasElement) {
        super(canvas);
    }

    protected renderInternal(context: CanvasRenderingContext2D, w: number, h: number) {
        context.clearRect(0.0, 0.0, w, h);
        context.fillStyle = "#f0f0f0";
        context.font = "12px monospace";
        context.textBaseline = "middle";

        const dataProvider = DataProvider.getInstance();
        const data = dataProvider.getFrameData();
        const lineY = Math.round((h - 1.0) * 0.5);

        for(const entry of data) {
            let s = dataProvider.remapTime(entry.start);
            let e = dataProvider.remapTime(entry.end);

            if(s < 1.0 && e > 0.0) {
                s = Math.ceil((s * w) + 1.0);
                e = Math.floor((e * w) - 1.0);

                const lineW = e - s;
                let text = "Frame " + entry.number;
                let textW = context.measureText(text).width;

                if(textW > lineW - 12.0) {
                    text = entry.number.toString();
                    textW = context.measureText(text).width;

                    if(textW > lineW - 12.0) {
                        text = undefined;
                    }
                }

                context.fillRect(s, 0.0, 1.0, h);
                context.fillRect(e - 1.0, 0.0, 1.0, h);

                if(text === undefined) {
                    context.fillRect(s, lineY, lineW, 1.0);
                } else {
                    const textX1 = (lineW - textW) * 0.5;
                    const textX2 = textX1 + textW;

                    context.fillRect(s, lineY, textX1 - 3.0, 1.0);
                    context.fillRect(s + textX2 + 3.0, lineY, lineW - textX2 - 3.0, 1.0);
                    context.fillText(text, s + textX1, Math.floor(h * 0.5));
                }
            }
        }
    }
}
