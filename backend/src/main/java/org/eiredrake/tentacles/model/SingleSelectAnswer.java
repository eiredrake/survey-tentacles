package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "single_select_answer")
public class SingleSelectAnswer extends Answer {

    @ManyToOne(optional = false)
    @JoinColumn(name = "option_id", nullable = false)
    private SingleSelectOption option;

    public SingleSelectOption getOption() {
        return option;
    }

    public void setOption(SingleSelectOption option) {
        this.option = option;
    }
}