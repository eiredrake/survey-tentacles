package org.eiredrake.tentacles.model;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "relationship_question")
public class RelationshipQuestion extends Question {

    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    private List<RelationshipSubject> subjects = new ArrayList<>();

    public List<RelationshipSubject> getSubjects() {
        return subjects;
    }

    public void setSubjects(List<RelationshipSubject> subjects) {
        this.subjects = subjects;
    }
}