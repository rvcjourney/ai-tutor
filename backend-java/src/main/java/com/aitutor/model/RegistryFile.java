package com.aitutor.model;

import java.util.List;

/** The shape of modules-registry.json's content — {"modules": [...]}. */
public class RegistryFile {
    public List<ModuleEntry> modules;

    public RegistryFile() {
    }

    public RegistryFile(List<ModuleEntry> modules) {
        this.modules = modules;
    }
}
