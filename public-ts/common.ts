export function request(url: string, method: string = "GET"): Promise<string> {
    return new Promise((resolve, reject) => {
        let req = new XMLHttpRequest();

        req.open(method, url);
        req.onload = () => resolve(req.responseText);
        req.onerror = () => reject(new Error("XMLHttpRequest error: " + req.statusText));
        req.send();
    });
}

let aElement: HTMLAnchorElement | undefined = undefined;
let divElement: HTMLDivElement | undefined = undefined;

export function absoluteURL(url: string): string {
    if(aElement === undefined) {
        aElement = document.createElement("a");
    }

    aElement.href = url;
    return aElement.href;
}

export function escapeHTML(text: string): string {
    if(divElement === undefined) {
        divElement = document.createElement("div");
    }

    divElement.innerText = text;
    return divElement.innerHTML;
}

function prefixZeroes(x: number): string {
    if(x < 10) {
        return "0" + x;
    } else {
        return x.toString();
    }
}

export function formatTime(t: number): string {
    const totalMinutes = Math.floor(t / 60);
    const seconds = t - totalMinutes * 60;
    const hours = Math.floor(totalMinutes / 60);

    let secondsStr = seconds.toFixed(3);
    if(seconds < 10) {
        secondsStr = "0" + secondsStr;
    }

    return prefixZeroes(hours) + ":" + prefixZeroes(totalMinutes - hours * 60) + ":" + secondsStr;
}

export class SimpleEvent {
    private callbacks: VoidFunction[] = [];

    public register(f: VoidFunction) {
        this.callbacks.push(f);
    }

    public invoke() {
        for(const f of this.callbacks) {
            f();
        }
    }
}

export interface EventHandler<T> {
    (arg0: T);
}

export class Event<T> {
    private callbacks: EventHandler<T>[] = [];

    public register(f: EventHandler<T>) {
        this.callbacks.push(f);
    }

    public invoke(arg0: T) {
        for(const f of this.callbacks) {
            f(arg0);
        }
    }
}

const TIME_UNITS: string[] = ["ns", "µs", "ms", "s"];

export function formatNanoTime(t: number): string {
    let unit = 0;

    while(t >= 1000.0 && unit < TIME_UNITS.length - 1) {
        t /= 1000.0;
        unit++;
    }

    if(unit <= 0) {
        return t.toString() + " " + TIME_UNITS[0];
    } else {
        return t.toFixed(3) + " " + TIME_UNITS[unit];
    }
}
