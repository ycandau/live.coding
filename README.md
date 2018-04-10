# live.editor

> A browser editor based on codemirror to create and patch objects in Max MSP.

## Commands

### Object commands

- **add**: add Max objects (and connections if indicated)
- **view**: add views for jamoma objects
- **del**: delete Max objects
- **delview**: delete views for jamoma objects
- **disc**: delete connections
- **mess**: send messages to Max objects

If no command is provided, it is assumed to be **mess**.

These commands all expect a number of subsequent object expressions and connections (see syntax below).

### Additional commands

- **audio**: to toggle the audio on and off

```
Usage:  audio [on | off]
```

- **list**: get information on the available commands, as well as object classes, types and properties (mainly based on [live.coding.json](./live.coding.json)).

```
Usage:  list [commands | classes | types | props | type <a_type> | prop <a_prop> | class <a_class>]

list                   // help on the list command
list commands          // list the available commands
list classes           // list the available classes
list types             // list the different types
list props             // list the different properties
list type fx           // list all classes with the type 'fx'
list prop stero        // list all classes with the property 'stereo'
list class denoiser    // display information on the 'denoiser' class
```

- **js**: send messages directly to the javascript object in the Max patcher

## Object expressions syntax

Any number of object expressions can be chained, with optional connections indicated by '-' between them. The general syntax is:

```
statement         = command object_expression (('-')? object_expression)*
object_expression = class: instance (arguments) [messages] .inlet .outlet
```

Besides the class and instance name, the order of these elements does not matter, and most are optional. At minimum, an object expression can be a class or an existing instance name:

```
add myo   ==>  myo:myo0
del myo0
```

The parser disregards spaces, and recognizes:
  - integers
  - floats
  - words: `[a-zA-Z][a-zA-Z0-9_]*`
  - strings: using double quotes for consistency with Max

Note: Internally floats are `float` or `cast_float` to keep track of round floats such as `2.`

### Class

This should be a word. Classes are defined in [live.coding.json](./live.coding.json).

Predefined classes include:
- jamoma objects
- minim objects
- predefined Max objects, currently: scale, atodb, dbtoa, unpack
- generic Max objects, created using the `maxobj` class (see the arguments examples below)

### Instance

This should be a word or a single digit. It is a unique name to identify the Max object. If omitted in the expression, a name is automatically created by appending a number to the class. If a single character is provided, a name is created by appending that character to the class.

```
myo           ==>  myo:myo0       // instance name created automatically
myo: L        ==>  myo:myoL       // instance name from appending a single char or digit
myo: leftMyo  ==>  myo:leftMyo    // instance name fully defined
```

### Arguments

These arguments are passed to the Max object on creation. Arguments can include integers, floats, words or strings. Spaces, commas, colons and semicolons are disregarded. For known objects (from [live.coding.json](./live.coding.json)) the number of arguments is clipped if necessary.

This is also useful to create generic Max objects:

```
add maxobj: myPrint (print)
add maxobj: myPrepend (prepend foo)
```

### Messages

Messages are passed on to the corresponding Max objects, right after creation (when included in an **add** command) or afterwards. Messages can include integers, floats, words and strings. Spaces and colons are disregarded. Commas and semicolons indicate successive messages to be split and sent separately.

```
add maxobj: myPrint (print) ["Hello world!"]
mess myPrint [list 1 2. .3 a_word "a string"]
mess myPrint [message 1, message 2, message 3]    // send three messages to the print object
add maxobj:num0 (number) [set 2]                  // create a number object and set it to 2
```

### Inlets and outlets

Inlets and outlets can be specified in three ways, using data from [live.coding.json](./live.coding.json):

- As a positive integer, checking its range (`inlet_cnt` and `outlet_cnt`)
- As a word identifier, which can be partial and is matched to `inlet_ids` and `outlet_ids` (only works if there is a single match)
- If omitted the editor looks for a default value (`inlet_def` and `outlet_def`)

The expanded expressions returned by the editor only include inlets and outlets if there is a corresponding connection, and if there is more than one inlet or outlet to consider.

```
add myo      - scale        ==>  myo:myo0..acc - scale:scale0.data    // using default values
add myo..1   - scale.0      ==>  myo:myo1..gyro - scale:scale1.data   // using inlet and outlet indexes
add myo..q   - scale.e      ==>  myo:myo2..quat - scale:scale2.exp    // using autocompleted identifiers
add myo..emg - scale.inmin  ==>  myo:myo4..emg - scale:scale3.inmin   // using full identifiers
```

### Connections

Connections are specified using '-' between object expressions.

```
add myo scale      // create a myo and a scale object
add myo - scale    // create the two objects and a default connection
```
