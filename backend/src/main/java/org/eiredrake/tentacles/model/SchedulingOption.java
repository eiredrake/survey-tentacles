package org.eiredrake.tentacles.model;

import java.time.LocalDate;
import jakarta.persistence.*;

@Entity
@Table(name = "scheduling_option")
public class SchedulingOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "question_id", nullable = false)
    private SchedulingQuestion question;

    @Column(nullable = false)
    private LocalDate date;

    public Long getId() {
        return id;
    }

    public SchedulingQuestion getQuestion() {
        return question;
    }

    public void setQuestion(SchedulingQuestion question) {
        this.question = question;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }
}