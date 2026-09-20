package org.eiredrake.tentacles.model;

import java.util.ArrayList;
import java.util.List;
import jakarta.persistence.*;

@Entity
@Table(name = "single_select_question")
public class SingleSelectQuestion extends Question {
    public static final String ABSTAIN = "Abstain";
    public static final List<String> YES_NO_ABSTAIN_OPTIONS = List.of("Yes", "No", ABSTAIN);

    @Transient
    public SingleSelectOption getDefaultOption() {
        if (getType() != QuestionType.YES_NO_ABSTAIN) return null;
        return options.stream().filter(option -> ABSTAIN.equals(option.getLabel())).findFirst()
            .orElseThrow(() -> new IllegalStateException("Yes/No/Abstain question is missing its default option."));
    }

    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<SingleSelectOption> options = new ArrayList<>();

    public List<SingleSelectOption> getOptions() {
        return options;
    }
}
