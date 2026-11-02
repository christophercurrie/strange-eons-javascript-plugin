// Threaded execution, adapted from Strange Eons' threads.js.
//
// A GraalJS context can only be entered by one thread at a time. A task that
// runs while another thread is executing script code in the same session
// fails with an IllegalStateException.
import { Java } from "../internal/host.mjs";
import { assertDispatchThread, string } from "./common.mjs";

const BusyDialog = Java.type("ca.cgjennings.apps.arkham.BusyDialog");
const EventQueue = Java.type("java.awt.EventQueue");
const JavaThread = Java.type("java.lang.Thread");

let threadCount = 0;

export function Thread(name, functionToRun) {
    if (functionToRun === undefined) {
        functionToRun = name;
        name = null;
    }
    const threadName = name ?? "Script thread " + ++threadCount;
    let finished = false;
    let returnValue;
    const thread = new JavaThread(() => {
        returnValue = functionToRun();
        finished = true;
    }, threadName);
    thread.setDaemon(true);
    Object.defineProperties(this, {
        name: { get: () => threadName },
        alive: { get: () => thread.isAlive() },
        returnValue: { get: () => returnValue },
        hasReturnValue: { get: () => finished }
    });
    this.interrupt = () => thread.interrupt();
    this.join = function join(waitTime) {
        if (waitTime == null) {
            thread.join();
        } else {
            thread.join(Math.trunc(waitTime));
        }
        return returnValue;
    };
    this.start = () => thread.start();
    this.toString = () => threadName;
}

Thread.interrupted = () => JavaThread.interrupted();

Thread.busyWindow = function busyWindow(task, message, canCancel) {
    assertDispatchThread();
    let cancelled = false;
    let result = null;
    const feedback = {
        set maximumProgress(max) {
            BusyDialog.maximumProgress(Math.trunc(max));
        },
        set currentProgress(current) {
            BusyDialog.currentProgress(Math.trunc(current), 50);
        },
        set title(text) {
            BusyDialog.titleText(text);
        },
        set status(text) {
            BusyDialog.statusText(text, 50);
        },
        get cancelled() {
            return cancelled;
        }
    };
    const action = () => {
        try {
            result = task(feedback);
        } catch (ex) {
            Error.handleUncaught(ex);
        }
    };
    const cancelAction = canCancel ? () => {
        cancelled = true;
    } : null;
    new BusyDialog(null, message || string("busy-script"), action, cancelAction);
    return result;
};

Thread.run = function run(task) {
    const thread = new Thread(task);
    thread.start();
    return thread;
};

Thread.invokeLater = function invokeLater(task) {
    EventQueue.invokeLater(() => {
        try {
            task();
        } catch (ex) {
            Error.handleUncaught(ex);
        }
    });
};

Thread.invokeAndWait = function invokeAndWait(task) {
    if (EventQueue.isDispatchThread()) {
        return task();
    }
    let returnValue;
    try {
        EventQueue.invokeAndWait(() => {
            try {
                returnValue = task();
            } catch (ex) {
                Error.handleUncaught(ex);
            }
        });
    } catch (ex) {
        Error.handleUncaught(ex);
    }
    return returnValue;
};

Thread.Lock = Java.type("java.util.concurrent.locks.ReentrantLock");
