package com.aitutor.model;

import java.util.List;

/** The shape of main.json / each topic's own `<module-id>.json` content —
 *  {"states": [...]}. */
public class StatesFile {
    public List<State> states;

    public StatesFile() {
    }

    public StatesFile(List<State> states) {
        this.states = states;
    }
}
