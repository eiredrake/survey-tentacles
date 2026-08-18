package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "multi_select_answer")
public class MultiSelectAnswer extends Answer {

    @ManyToOne(optional = false)
    @JoinColumn(name = "option_id", nullable = false)
    private MultiSelectOption option;

    public MultiSelectOption getOption() {
        return option;
    }

    public void setOption(MultiSelectOption option) {
        this.option = option;
    }
}