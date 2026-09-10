package com.example.demo.dto;


public class UserRelationSuggestionDTO {

    private Long   pendingRelationId;
    private String suggestedUserName;
    private String suggestedUserEmail;
    private String suggestedUserPhone;
    private String suggestedUserProfilePic;
    private String suggestedUserGender;
    private String inferredRelation;
    private String englishRelation;
    private String indianRelation;
    private String genericRelation;
    private String reason;
    private String status;

    public UserRelationSuggestionDTO() {}

    public UserRelationSuggestionDTO(Long pendingRelationId,
                                     String suggestedUserName,
                                     String suggestedUserEmail,
                                     String suggestedUserPhone,
                                     String suggestedUserProfilePic,
                                     String suggestedUserGender,
                                     String inferredRelation,
                                     String englishRelation,
                                     String indianRelation,
                                     String genericRelation,
                                     String reason,
                                     String status) {
        this.pendingRelationId      = pendingRelationId;
        this.suggestedUserName      = suggestedUserName;
        this.suggestedUserEmail     = suggestedUserEmail;
        this.suggestedUserPhone     = suggestedUserPhone;
        this.suggestedUserProfilePic = suggestedUserProfilePic;
        this.suggestedUserGender    = suggestedUserGender;
        this.inferredRelation       = inferredRelation;
        this.englishRelation        = englishRelation;
        this.indianRelation         = indianRelation;
        this.genericRelation        = genericRelation;
        this.reason                 = reason;
        this.status                 = status;
    }

    public Long   getPendingRelationId()       { return pendingRelationId; }
    public String getSuggestedUserName()       { return suggestedUserName; }
    public String getSuggestedUserEmail()      { return suggestedUserEmail; }
    public String getSuggestedUserPhone()      { return suggestedUserPhone; }
    public String getSuggestedUserProfilePic() { return suggestedUserProfilePic; }
    public String getSuggestedUserGender()     { return suggestedUserGender; }
    public String getInferredRelation()        { return inferredRelation; }
    public String getEnglishRelation()         { return englishRelation; }
    public String getIndianRelation()          { return indianRelation; }
    public String getGenericRelation()         { return genericRelation; }
    public String getReason()                  { return reason; }
    public String getStatus()                  { return status; }
}