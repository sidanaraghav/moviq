package com.cozicut.api;

public record ApiError(String error, String message) {

    public ApiError(String error) {
        this(error, error);
    }
}
