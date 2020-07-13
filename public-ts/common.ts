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

export function absoluteURL(url: string): string {
    if(aElement === undefined) {
        aElement = document.createElement("a");
    }

    aElement.href = url;
    return aElement.href;
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
