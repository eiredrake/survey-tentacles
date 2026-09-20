package org.eiredrake.tentacles.model;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "meetup_question")
public class MeetupQuestion extends Question {}
