package org.eiredrake.tentacles.model;

import java.util.ArrayList;
import java.util.List;
import jakarta.persistence.*;

@Entity
@Table(name = "single_select_question")
public class SingleSelectQuestion extends Question {
    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<SingleSelectOption> options = new ArrayList<>();

    public List<SingleSelectOption> getOptions() {
        return options;
    }
}
