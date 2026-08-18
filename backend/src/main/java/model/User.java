package org.eiredrake.tentacles.model;

import jakarta.persistence.*;

@Entity
@Table(name = "tentacles_user")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "oidc_subject", nullable = false, unique = true)
    private String oidcSubject;

    @Column(nullable = false)
    private String username;

    private String email;

    @Column(name = "display_name")
    private String displayName;

    public Long getId() {
        return id;
    }

    public String getOidcSubject() {
        return oidcSubject;
    }

    public void setOidcSubject(String oidcSubject) {
        this.oidcSubject = oidcSubject;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }
}