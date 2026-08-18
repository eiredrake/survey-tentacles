package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "scheduling_answer")
public class SchedulingAnswer extends Answer {

    @ManyToOne(optional = false)
    @JoinColumn(name = "option_id", nullable = false)
    private SchedulingOption option;

    public SchedulingOption getOption() {
        return option;
    }

    public void setOption(SchedulingOption option) {
        this.option = option;
    }
}