package org.eiredrake.tentacles.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "relationship_answer")
public class RelationshipAnswer extends Answer {

  @ManyToOne(optional = false)
  @JoinColumn(name = "subject_id", nullable = false)
  private RelationshipSubject subject;

  @Column
  private Integer likeScore;

  @Column
  private Integer trustScore;

  @Column(length = 500)
  private String comment;

  public RelationshipSubject getSubject() {
    return subject;
  }

  public void setSubject(RelationshipSubject subject) {
    this.subject = subject;
  }

  public Integer getLikeScore() {
    return likeScore;
  }

  public void setLikeScore(Integer likeScore) {
    this.likeScore = likeScore;
  }

  public Integer getTrustScore() {
    return trustScore;
  }

  public void setTrustScore(Integer trustScore) {
    this.trustScore = trustScore;
  }

  public String getComment() {
    return comment;
  }

  public void setComment(String comment) {
    this.comment = comment;
  }
}
