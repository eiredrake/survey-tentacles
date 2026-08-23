package org.eiredrake.tentacles.model;

import java.time.LocalDate;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "scheduling_option")
public class SchedulingOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "question_id", nullable = false)
    private SchedulingQuestion question;

    @Column(nullable = true)
    private LocalDate date;
    
    @Column(nullable = true)
    private Instant dateTime;

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

    public Instant getDateTime() {
        return dateTime;
    }
    
    public void setDateTime(Instant dateTime) {
        this.dateTime = dateTime;
    }    
}