# Process communication protocol description

**Protocol version: 0.1.5 (fifth draft)**

Communication with the process to profile is realized with the help of shared memory. This document describes the organization of this shared memory as well
as the synchronization required to achieve safe data transmission between `temporal-lens` and `temporal-lens-server`.

## Passing string literals

One does not simply pass a `&str` through shared memory. A copy of the string contents is required. As this would kill the performances, what this protocol
does is that everytime a string has to be transmitted, we copy its address and its size, but we only copy its content once. The address will never be
dereferenced but instead will be used as a key inside a map to recover its contents.

## Shared memory structure

```rs
const MAGIC: u32 = 0x1DC45EF1;
const PROTOCOL_VERSION: u32 = 0x00_01_0005; //Major_Minor_Patch
const NUM_ENTRIES: usize = 32;
const LOG_DATA_SIZE: usize = 8192;
const SHARED_STRING_MAX_SIZE: usize = 128;

type Time = f64;     //Low precision time (seconds since program beginning)
type Duration = u64; //High precision time difference (nanoseconds)
type Color = u32;    //24 bits, 0x00RRGGBB

#[derive(Copy, Clone)]
struct SharedString {
    key: usize,                            //A number that uniquely identifies this zone's name string (typically, the string's address)
    size: u8,                              //The length of this string, max SHARED_STRING_MAX_SIZE bytes
    has_contents: bool,                    //False if this string has already been sent 
    contents: [u8; SHARED_STRING_MAX_SIZE] //If has_contents is true, the string's contents
}

#[derive(Copy, Clone)]
struct FrameData {
    number: u64,       //Frame number
    end: Time,         //Time when the frame ended
    duration: Duration //Total frame time. start = end - duration if you convert the units first ;)
}

#[derive(Copy, Clone)]
struct ZoneData {
    uid: usize,          //A number that uniquely identifies the zone
    color: Color,        //The color of the zone
    end: Time,           //Time when the zone ended
    duration: Duration,  //The execution time. start = end - duration if you convert the units first ;)
    depth: u32,          //Call stack depth
    name: SharedString,  //The name of the zone
    thread: SharedString //Thread thread ID
}

#[derive(Copy, Clone)]
struct PlotData {
    time: Time,        //Time (X axis)
    color: Color,      //Color of the plot
    value: f64,        //Value to plot (Y axis)
    name: SharedString //Plot name, which is also used as unique identifier
}

#[derive(Copy, Clone)]
struct HeapData {
    time: Time,   //Time at which the (de)allocation happened
    addr: usize,  //Address of the (de)allocated memory
    size: usize,  //Size of the (de)allocated memory
    is_free: bool //True if the memory was deallocated, false otherwise
}

#[repr(packed)]
#[derive(Copy, Clone)]
struct LogEntryHeader {
    time: Time,   //Time at which the message was logged
    color: Color, //Color of the message
    length: usize //Amount of bytes contained in the string
}

struct Payload<T: Sized + Copy> {
    lock: SpinLock,        //A simple spin lock based on an AtomicBool
    size: usize,           //How many valid entries are available in `data`
    data: [T; NUM_ENTRIES]
}

struct SharedMemoryData {
    //Compatibility fields
    magic: u32,
    protocol_version: u32,
    sizeof_usize: u32,

    //Payloads
    frame_data: Payload<FrameData>,
    zone_data: Payload<ZoneData>,
    heap_data: Payload<HeapData>,
    plot_data: Payload<PlotData>,

    //Log data; different as it can contain Strings of variable size
    log_data_lock: SpinLock,      //A simple spin lock based on an AtomicBool
    log_data_count: u32,          //How many valid log messages are available in `log_data`
    log_data: [u8; LOG_DATA_SIZE] //Array of LogEntryHeader followed by `header.length` bytes of log message
}
```

## Synchronization

Safe data transmission is achieved using spin locks. These are extremely lightweight and consists in a simple AtomicBool, which makes it extremely easy
to pass them through shared memory.
