package org.eiredrake.tentacles.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "short_text_answer")
public class ShortTextAnswer extends Answer {

    @Column(nullable = false, columnDefinition = "text")
    private String value;

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }
}