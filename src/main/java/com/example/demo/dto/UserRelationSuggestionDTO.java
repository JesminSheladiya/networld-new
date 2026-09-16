package com.example.demo.dto;


public class UserRelationSuggestionDTO {

    private Long   pendingRelationId;
    private String suggestedUserName;
    private String suggestedUserUsername;
    private String suggestedUserEmail;
    private String suggestedUserPhone;
    private String suggestedUserProfilePic;
    private String suggestedUserCoverImage;
    private String suggestedUserGender;
    private java.time.LocalDate suggestedUserBirthDate;
    private String suggestedUserBio;
    private String inferredRelation;
    private String englishRelation;
    private String indianRelation;
    private String genericRelation;
    private String reason;
    private String status;

    public UserRelationSuggestionDTO() {}

    public UserRelationSuggestionDTO(Long pendingRelationId,
                                     String suggestedUserName,
                                     String suggestedUserUsername,
                                     String suggestedUserEmail,
                                     String suggestedUserPhone,
                                     String suggestedUserProfilePic,
                                     String suggestedUserCoverImage,
                                     String suggestedUserGender,
                                     java.time.LocalDate suggestedUserBirthDate,
                                     String suggestedUserBio,
                                     String inferredRelation,
                                     String englishRelation,
                                     String indianRelation,
                                     String genericRelation,
                                     String reason,
                                     String status) {
        this.pendingRelationId      = pendingRelationId;
        this.suggestedUserName       = suggestedUserName;
        this.suggestedUserUsername   = suggestedUserUsername;
        this.suggestedUserEmail      = suggestedUserEmail;
        this.suggestedUserPhone      = suggestedUserPhone;
        this.suggestedUserProfilePic = suggestedUserProfilePic;
        this.suggestedUserCoverImage = suggestedUserCoverImage;
        this.suggestedUserGender    = suggestedUserGender;
        this.suggestedUserBirthDate = suggestedUserBirthDate;
        this.suggestedUserBio       = suggestedUserBio;
        this.inferredRelation       = inferredRelation;
        this.englishRelation        = englishRelation;
        this.indianRelation         = indianRelation;
        this.genericRelation        = genericRelation;
        this.reason                 = reason;
        this.status                 = status;
    }

    public Long   getPendingRelationId()       { return pendingRelationId; }
    public String getSuggestedUserName()       { return suggestedUserName; }
    public String getSuggestedUserUsername()   { return suggestedUserUsername; }
    public String getSuggestedUserEmail()      { return suggestedUserEmail; }
    public String getSuggestedUserPhone()      { return suggestedUserPhone; }
    public String getSuggestedUserProfilePic() { return suggestedUserProfilePic; }
    public String getSuggestedUserCoverImage() { return suggestedUserCoverImage; }
    public String getSuggestedUserGender()     { return suggestedUserGender; }
    public java.time.LocalDate getSuggestedUserBirthDate() { return suggestedUserBirthDate; }
    public String getSuggestedUserBio()      { return suggestedUserBio; }
    public String getInferredRelation()        { return inferredRelation; }
    public String getEnglishRelation()         { return englishRelation; }
    public String getIndianRelation()          { return indianRelation; }
    public String getGenericRelation()         { return genericRelation; }
    public String getReason()                  { return reason; }
    public String getStatus()                  { return status; }
}