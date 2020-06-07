# Process communication protocol description

**Protocol version: 0.1.0 (first draft)**

Communication with the process to profile is realized with the help of shared memory. This document describes the organization of this shared memory as well
as the synchronization required to achieve safe data transmission between `temporal-lens` and `temporal-lens-server`.

## Passing string literals

One does not simply pass a `&str` through shared memory. A copy of the string contents is required. As this would kill the performances, what this protocol
does is that everytime a string has to be transmitted, we copy its address and its size, but we only copy its content once. The address will never be
dereferenced but instead will be used as a key inside a map to recover its contents.

## Shared memory structure

```rs
const PROTOCOL_VERSION: u32 = 0x00_01_0000; //Major_Minor_Patch
const NUM_ENTRIES: usize = 32;
const LOG_DATA_SIZE: usize = 8192;

type Time = f64;     //TBD. Low precision time
type Duration = u64; //TBD. High precision time difference
type Color = u32;    //24 bits, 0x00RRGGBB

#[derive(Copy, Clone)]
struct SharedString {
    key: usize,                 //A number that uniquely identifies this zone's name string (typically, the string's address)
    size: u8,                   //The length of this string, max 128 bytes
    contents: Option<[u8; 128]> //None if this string has already been sent. Otherwise, the string's contents
}

#[derive(Copy, Clone)]
struct ZoneData {
    uid: u32,           //A number that uniquely identifies the zone
    color: Color,       //The color of the zone
    start: Time,        //Time when the zone started
    duration: Duration, //The execution time
    name: SharedString  //The name of the zone
}

#[derive(Copy, Clone)]
struct PlotData {
    time: Time,
    color: Color,
    value: f64,
    name: SharedString
}

#[derive(Copy, Clone)]
struct HeapData {
    time: Time,
    addr: usize,
    size: usize,
    is_free: bool
}

#[repr(packed)]
#[derive(Copy, Clone)]
struct LogEntryHeader {
    time: Time,
    color: Color,
    length: usize
}

struct Payload<T: Sized + Copy> {
    lock: SpinLock,        //A simple spin lock based on an AtomicBool
    size: usize,           //How many valid entries are available in `data`
    data: [T; NUM_ENTRIES]
}

struct SharedMemoryData {
    //Compatibility fields
    protocol_version: u32,
    sizeof_usize: u32,

    //Useful data
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
