package org.eiredrake.tentacles.model;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "scheduling_question")
public class SchedulingQuestion extends Question {

    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("date ASC")
    private List<SchedulingOption> options = new ArrayList<>();

    public List<SchedulingOption> getOptions() {
        return options;
    }

    public void setOptions(List<SchedulingOption> options) {
        this.options = options;
    }
}