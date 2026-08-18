package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "multi_select_option")
public class MultiSelectOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "question_id", nullable = false)
    private MultiSelectQuestion question;

    @Column(nullable = false)
    private String label;

    public Long getId() {
        return id;
    }

    public MultiSelectQuestion getQuestion() {
        return question;
    }

    public void setQuestion(MultiSelectQuestion question) {
        this.question = question;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }
}