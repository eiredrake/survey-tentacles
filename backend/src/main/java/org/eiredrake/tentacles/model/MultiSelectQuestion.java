package org.eiredrake.tentacles.model;

import java.util.ArrayList;
import java.util.List;
import jakarta.persistence.*;

@Entity
@Table(name = "multi_select_question")
public class MultiSelectQuestion extends Question {
    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<MultiSelectOption> options = new ArrayList<>();

    public List<MultiSelectOption> getOptions() {
        return options;
    }
}
