package com.cozicut.api;

import com.cozicut.media.MediaProcessingException;
import com.cozicut.media.MediaProcessingTimeoutException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> illegalArgument(IllegalArgumentException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError("Bad Request", exception.getMessage()));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiError> missingParam(MissingServletRequestParameterException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError("Bad Request", "Required parameter '" + exception.getParameterName() + "' is missing."));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<ApiError> missingPart(MissingServletRequestPartException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError("Bad Request", "Required request part '" + exception.getRequestPartName() + "' is missing."));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> typeMismatch(MethodArgumentTypeMismatchException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError("Bad Request", "Invalid format for parameter: " + exception.getName()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiError> maxUploadSize(MaxUploadSizeExceededException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError("Bad Request", "Audio file exceeds the 50 MB limit."));
    }

    @ExceptionHandler(MediaProcessingTimeoutException.class)
    public ResponseEntity<ApiError> timeout(MediaProcessingTimeoutException exception) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("Internal Server Error", "Audio processing timed out."));
    }

    @ExceptionHandler(MediaProcessingException.class)
    public ResponseEntity<ApiError> processingFailure(MediaProcessingException exception) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_CONTENT)
                .body(new ApiError("Unprocessable Content", "The supplied audio could not be processed."));
    }
}
