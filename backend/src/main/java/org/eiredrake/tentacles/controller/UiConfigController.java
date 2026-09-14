package org.eiredrake.tentacles.controller;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UiConfigController {
    private final boolean development;

    public UiConfigController(@Value("${tentacles.ui.development:false}") boolean development) {
        this.development = development;
    }

    @GetMapping("/api/ui-config")
    public ResponseEntity<Map<String, Boolean>> uiConfig() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("development", development));
    }
}
