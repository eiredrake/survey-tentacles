package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "single_select_option")
public class SingleSelectOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "question_id", nullable = false)
    private SingleSelectQuestion question;

    @Column(nullable = false)
    private String label;

    public Long getId() {
        return id;
    }

    public SingleSelectQuestion getQuestion() {
        return question;
    }

    public void setQuestion(SingleSelectQuestion question) {
        this.question = question;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }
}